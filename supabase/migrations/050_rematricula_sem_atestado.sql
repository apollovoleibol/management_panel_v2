-- 050 · Rematrícula 2027 sem atestado de aptidão física
-- O atestado deixa de ser pedido no formulário e de ser exigido para concluir.
--   * reenroll_missing não lista mais 'atestado'.
--   * O envio anônimo para o bucket fica fechado: sai a regra de upload e as funções
--     de upload perdem a permissão de execução. As colunas atestado_* e o bucket ficam
--     (sem uso) para não apagar nada já gravado.
--   * O Regulamento do Atleta 2027 deixa de citar o atestado: versão preliminar-2.
begin;

create or replace function private.reenroll_missing(r public.reenrollments) returns text[]
language sql stable set search_path = '' as $$
  select array_remove(array[
    case when r.id is null or not (r.steps ? 'cadastro') then 'cadastro' end,
    case when r.id is null or not (r.steps ? 'endereco') then 'endereco' end,
    case when r.id is null or not (r.steps ? 'saude') then 'saude' end,
    case when r.id is null or not (r.steps ? 'equipe') then 'equipe' end,
    case when r.id is null or not (r.steps ? 'termos') then 'termos' end
  ], null) $$;

create or replace function private.reenroll_regulation() returns text
language sql immutable set search_path = '' as $$ select 'regulamento-atleta-2027-preliminar-2'::text $$;

drop policy if exists rematricula_upload on storage.objects;

revoke execute on function
  public.reenroll_upload_slot(text, uuid, text), public.reenroll_upload_allowed(text),
  public.reenroll_attach(text, uuid, text, text, text, integer)
  from public, anon, authenticated;

commit;
