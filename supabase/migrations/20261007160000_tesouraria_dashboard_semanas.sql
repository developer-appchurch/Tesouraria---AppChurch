-- Dashboard da Tesouraria: percentuais por SEMANA entregue.
--
-- Substitui tesouraria_dashboard_resumo acrescentando as colunas
-- semanas_entregues e semanas_validadas. As colunas antigas continuam iguais
-- (valores em reais seguem somados pela data do relatório).
--
-- Regra das semanas:
-- - Semana = segunda a domingo. Ela pertence ao mês da sua quinta-feira
--   (toda semana fica em um único mês; todo mês tem 4 ou 5 semanas).
-- - Semana entregue = a célula tem ao menos um relatório naquela semana.
-- - Semana validada = todos os relatórios da célula naquela semana foram validados.
-- Assim o percentual não depende do dia de reunião cadastrado (que está diferente
-- do real em parte das células).
--
-- O tipo de retorno muda, por isso a função é recriada (drop + create).
-- Não altera nem apaga dados. A API funciona com a versão antiga ou nova.

drop function if exists public.tesouraria_dashboard_resumo(uuid, integer);

create function public.tesouraria_dashboard_resumo(p_igreja_id uuid, p_ano integer default null)
returns table (
  ano integer,
  mes integer,
  setor text,
  enviados bigint,
  validados bigint,
  pix_validado numeric,
  especie_validado numeric,
  semanas_entregues bigint,
  semanas_validadas bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      r.id,
      r.unidade_id,
      r.data_relatorio,
      r.tesouraria_recebido,
      r.valor_pix,
      r.valor_especie,
      -- Setor = unidade pai da célula; sem pai, tenta "setor: X" na observação
      coalesce(
        pai.nome,
        nullif(trim((regexp_match(r.observacao, 'setor:\s*([^|]+)', 'i'))[1]), ''),
        'Sem setor'
      )::text as setor,
      -- Segunda-feira da semana do relatório
      (r.data_relatorio - (extract(isodow from r.data_relatorio)::int - 1))::date as segunda
    from relatorios_semanais r
    left join unidades u on u.id = r.unidade_id
    left join unidades pai on pai.id = u.pai_id
    where r.igreja_id = p_igreja_id
      and r.data_relatorio is not null
      -- margem de 7 dias: semanas na virada do ano pertencem ao ano da quinta-feira
      and (
        p_ano is null
        or (r.data_relatorio >= make_date(p_ano, 1, 1) - 7 and r.data_relatorio < make_date(p_ano + 1, 1, 1) + 7)
      )
  ),
  -- Quantidades e valores pelo mês da DATA do relatório
  por_data as (
    select
      extract(year from b.data_relatorio)::int as ano,
      extract(month from b.data_relatorio)::int as mes,
      b.setor,
      count(*) as enviados,
      count(*) filter (where b.tesouraria_recebido is true) as validados,
      coalesce(sum(b.valor_pix) filter (where b.tesouraria_recebido is true), 0) as pix_validado,
      coalesce(sum(b.valor_especie) filter (where b.tesouraria_recebido is true), 0) as especie_validado
    from base b
    where p_ano is null or extract(year from b.data_relatorio) = p_ano
    group by 1, 2, 3
  ),
  -- Semanas entregues/validadas pelo mês da QUINTA-FEIRA da semana
  por_semana as (
    select
      extract(year from s.segunda + 3)::int as ano,
      extract(month from s.segunda + 3)::int as mes,
      s.setor,
      count(*) as semanas_entregues,
      count(*) filter (where s.validada) as semanas_validadas
    from (
      select b.setor, coalesce(b.unidade_id, b.id) as celula, b.segunda,
             bool_and(b.tesouraria_recebido is true) as validada
      from base b
      group by 1, 2, 3
    ) s
    where p_ano is null or extract(year from s.segunda + 3) = p_ano
    group by 1, 2, 3
  )
  select
    coalesce(d.ano, s.ano),
    coalesce(d.mes, s.mes),
    coalesce(d.setor, s.setor),
    coalesce(d.enviados, 0),
    coalesce(d.validados, 0),
    coalesce(d.pix_validado, 0),
    coalesce(d.especie_validado, 0),
    coalesce(s.semanas_entregues, 0),
    coalesce(s.semanas_validadas, 0)
  from por_data d
  full join por_semana s on s.ano = d.ano and s.mes = d.mes and s.setor = d.setor
$$;

-- A igreja é escolhida pela API a partir da sessão do usuário:
-- a função não pode ser chamada direto do navegador.
revoke all on function public.tesouraria_dashboard_resumo(uuid, integer) from public, anon, authenticated;
grant execute on function public.tesouraria_dashboard_resumo(uuid, integer) to service_role;
