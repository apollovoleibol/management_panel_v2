-- Verificação da migração 049 (Rematrícula 2027) no banco real.
-- Tudo roda numa transação com um atleta sintético e termina em ROLLBACK: nada fica gravado.
-- Confere, contra os gatilhos e permissões reais: o fluxo completo como "anon" (o papel do formulário público),
-- a regra de upload do Storage, o bloqueio de leitura direta e a gravação final na ficha do atleta.
begin;

do $$
declare t uuid;
begin
  select id into t from public.teams where is_active is true order by name limit 1;
  if t is null then raise exception 'Nenhuma equipe ativa'; end if;
  insert into public.athletes(id, team_id, full_name, birth_date, cpf, rg, email, phone, emergency_contact, address, is_active)
  values ('00000000-0490-4000-8000-000000000001', t, 'VERIFICACAO REMATRICULA', '1991-03-07', '386.251.943-03', '00.000.049-0',
          'verificacao@exemplo.com', '(41) 90000-0490', 'Contato teste - 41 90000-0491', 'Rua Antiga, 1', true);
  perform set_config('verify.team', t::text, true);
end $$;

set local role anon;

do $$
declare
  aid uuid := '00000000-0490-4000-8000-000000000001';
  r jsonb; tok text; ath jsonb; f jsonb; slot jsonb; h jsonb := '{}'::jsonb; n int; blocked boolean := false;
begin
  -- Identificação errada não revela o motivo; certa abre sessão
  r := public.reenroll_start('386.251.943-03', '1991-03-08');
  if (r ->> 'ok')::boolean then raise exception 'Data errada foi aceita'; end if;
  r := public.reenroll_start('38625194303', '1991-03-07');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'Identificação falhou: %', r; end if;
  tok := r ->> 'token';

  r := public.reenroll_get(tok);
  ath := r -> 'athletes' -> 0;
  if ath ->> 'id' <> aid::text then raise exception 'Atleta errado na sessão'; end if;
  if ath::text like '%Rua Antiga%' then raise exception 'Endereço vazou para o navegador'; end if;
  if jsonb_array_length(r -> 'teams') = 0 then raise exception 'Lista de equipes vazia'; end if;

  -- Cadastro: tudo confirmado, e-mail alterado
  f := (ath -> 'data') || '{"email":"verificacao.nova@exemplo.com"}';
  perform public.reenroll_save(tok, aid, 'cadastro', jsonb_build_object('fields', f,
    'confirmed', (select jsonb_agg(k) from jsonb_object_keys(ath -> 'data') k where k <> 'email')));
  perform public.reenroll_save(tok, aid, 'endereco', '{"cep":"80010-010","rua":"Rua Marechal Deodoro","numero":"100","complemento":"","bairro":"Centro","cidade":"Curitiba","uf":"PR"}');
  h := '{"estatura":"170","peso":"65","q3":"Não","q4":["Não"],"q9":"Adequada","q9_1":"4","q10":["Não tenho histórico"],"q12":["Nunca tive nenhum desses problemas"],"q13":["Não tenho histórico familiar"],"q15":""}';
  foreach n in array array[1,2,5,6,7,8,11,14] loop h := h || jsonb_build_object('q' || n || '_yn', 'Não'); end loop;
  perform public.reenroll_save(tok, aid, 'saude', h);
  perform public.reenroll_save(tok, aid, 'equipe', jsonb_build_object('team_id', current_setting('verify.team'), 'note', ''));
  perform public.reenroll_save(tok, aid, 'termos', '{"dados":true,"regulamento":true,"imagem":true,"declaracao":true,"ua":"VERIFY_049"}');

  -- Storage: caminho inventado é recusado pela regra; o caminho do slot é aceito
  begin
    insert into storage.objects(bucket_id, name) values ('rematricula', '2027/' || aid || '/inventado.pdf');
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  if not blocked then raise exception 'Storage aceitou caminho fora do slot'; end if;
  slot := public.reenroll_upload_slot(tok, aid, 'pdf');
  insert into storage.objects(bucket_id, name, metadata) values ('rematricula', slot ->> 'path', '{"size":1000,"mimetype":"application/pdf"}');
  perform public.reenroll_attach(tok, aid, slot ->> 'path', 'atestado.pdf', 'application/pdf', 1000);

  r := public.reenroll_finish(tok, aid);
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'Conclusão falhou: %', r; end if;

  -- Leitura direta continua bloqueada para o navegador anônimo
  blocked := false;
  begin perform 1 from public.reenrollments limit 1;
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'anon conseguiu ler public.reenrollments'; end if;
  blocked := false;
  begin perform public.reenroll_panel(2027::smallint);
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'anon conseguiu executar reenroll_panel'; end if;
end $$;

reset role;

do $$
declare a public.athletes; rr public.reenrollments;
begin
  select * into a from public.athletes where id = '00000000-0490-4000-8000-000000000001';
  select * into rr from public.reenrollments where athlete_id = a.id;
  if a.email <> 'verificacao.nova@exemplo.com' then raise exception 'E-mail não gravado: %', a.email; end if;
  if a.address <> 'Rua Marechal Deodoro, 100 - Centro - Curitiba/PR - CEP 80010-010' then raise exception 'Endereço inesperado: %', a.address; end if;
  if rr.status <> 'concluida' or rr.previous_data ->> 'address' <> 'Rua Antiga, 1' then raise exception 'Rematrícula não concluída corretamente'; end if;
  if rr.changed_fields <> array['email'] then raise exception 'Campos alterados inesperados: %', rr.changed_fields; end if;
end $$;

select '049 verificada: fluxo anon, Storage e gravação final ok; tudo desfeito' as verification;
rollback;
