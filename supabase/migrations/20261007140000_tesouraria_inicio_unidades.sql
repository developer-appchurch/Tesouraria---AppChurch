-- Data de início de cada unidade (célula) da igreja, para o Dashboard não prever
-- relatórios de uma célula em meses anteriores à sua criação.
--
-- início = a mais antiga entre a data de criação (unidades.criado_em) e o primeiro
-- relatório lançado. Motivo: as unidades importadas têm criado_em = data da
-- importação (04/10/2026), mas relatórios desde janeiro; para elas vale o primeiro
-- relatório. Para unidades criadas depois da importação, vale a data real de criação.
--
-- Migração só ADITIVA: cria uma função, não altera nem apaga dados.
-- Enquanto não for aplicada, a rota /api/treasury calcula o mesmo no servidor Node.
-- Índice usado: idx_relatorios_unidade_data (unidade_id, data_relatorio DESC), já existente.

create or replace function public.tesouraria_inicio_unidades(p_igreja_id uuid)
returns table (unidade_id uuid, inicio date)
language sql
stable
security invoker
set search_path = public
as $$
  select
    u.id as unidade_id,
    least(
      u.criado_em::date,
      (select min(r.data_relatorio) from relatorios_semanais r where r.unidade_id = u.id)
    ) as inicio
  from unidades u
  where u.igreja_id = p_igreja_id
$$;

-- A igreja é escolhida pela API a partir da sessão do usuário:
-- a função não pode ser chamada direto do navegador.
revoke all on function public.tesouraria_inicio_unidades(uuid) from public, anon, authenticated;
grant execute on function public.tesouraria_inicio_unidades(uuid) to service_role;
