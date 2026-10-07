-- Totais do Dashboard da Tesouraria já agregados no banco.
-- Em vez de enviar todos os relatórios do período para o navegador (milhares de
-- linhas), devolve uma linha por (ano, mês, setor): ~100 linhas por ano.
--
-- Migração só ADITIVA: cria uma função, não altera nem apaga dados.
-- Enquanto não for aplicada, a rota /api/treasury calcula os mesmos totais no
-- servidor Node (mesmo formato de resposta), então o app funciona com ou sem ela.
--
-- Índice usado: idx_relatorios_igreja_data (igreja_id, data_relatorio DESC), já existente.

create or replace function public.tesouraria_dashboard_resumo(p_igreja_id uuid, p_ano integer default null)
returns table (
  ano integer,
  mes integer,
  setor text,
  enviados bigint,
  validados bigint,
  pix_validado numeric,
  especie_validado numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    extract(year from r.data_relatorio)::int as ano,
    extract(month from r.data_relatorio)::int as mes,
    -- Setor = unidade pai da célula; sem pai, tenta "setor: X" na observação
    coalesce(
      pai.nome,
      nullif(trim((regexp_match(r.observacao, 'setor:\s*([^|]+)', 'i'))[1]), ''),
      'Sem setor'
    )::text as setor,
    count(*) as enviados,
    count(*) filter (where r.tesouraria_recebido is true) as validados,
    coalesce(sum(r.valor_pix) filter (where r.tesouraria_recebido is true), 0) as pix_validado,
    coalesce(sum(r.valor_especie) filter (where r.tesouraria_recebido is true), 0) as especie_validado
  from relatorios_semanais r
  left join unidades u on u.id = r.unidade_id
  left join unidades pai on pai.id = u.pai_id
  where r.igreja_id = p_igreja_id
    and r.data_relatorio is not null
    and (
      p_ano is null
      or (r.data_relatorio >= make_date(p_ano, 1, 1) and r.data_relatorio < make_date(p_ano + 1, 1, 1))
    )
  group by 1, 2, 3
$$;

-- A igreja é escolhida pela API a partir da sessão do usuário: a função não deve
-- ser chamada direto do navegador com um p_igreja_id qualquer.
revoke all on function public.tesouraria_dashboard_resumo(uuid, integer) from public, anon, authenticated;
grant execute on function public.tesouraria_dashboard_resumo(uuid, integer) to service_role;
