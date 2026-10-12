-- ==============================================================================
-- Migração da Tabela de Fluxo de Caixa (Tesouraria AppChurch)
-- ==============================================================================
-- Colunas solicitadas:
-- "ID", "CategoriaFluxo", "TipoFluxo", "ValorFluxo", "DataFluxo",
-- "Id_Tesoureiro", "StatusFluxo", "ObservacoesFluxo"
-- com a adição da coluna "id_igreja"
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.fluxo_caixa (
  "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "id_igreja" UUID NOT NULL REFERENCES public.igrejas(id) ON DELETE CASCADE,
  "CategoriaFluxo" VARCHAR(100) NOT NULL,
  "TipoFluxo" VARCHAR(50) NOT NULL, -- 'Entrada' ou 'Saída'
  "ValorFluxo" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  "DataFluxo" DATE NOT NULL DEFAULT CURRENT_DATE,
  "Id_Tesoureiro" UUID REFERENCES public.membros(id) ON DELETE SET NULL,
  "StatusFluxo" VARCHAR(50) NOT NULL DEFAULT 'CONFIRMADO', -- 'CONFIRMADO' ou 'PENDENTE'
  "ObservacoesFluxo" TEXT,
  "criado_em" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "atualizado_em" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de alto desempenho para buscas, filtros e agrupamentos por igreja
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_igreja_data ON public.fluxo_caixa ("id_igreja", "DataFluxo" DESC);
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_igreja_tipo ON public.fluxo_caixa ("id_igreja", "TipoFluxo");
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_igreja_categoria ON public.fluxo_caixa ("id_igreja", "CategoriaFluxo");
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_tesoureiro ON public.fluxo_caixa ("Id_Tesoureiro");

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.fluxo_caixa ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fluxo_caixa' AND policyname = 'Permitir leitura fluxo_caixa'
  ) THEN
    CREATE POLICY "Permitir leitura fluxo_caixa"
      ON public.fluxo_caixa FOR SELECT
      TO authenticated, service_role
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fluxo_caixa' AND policyname = 'Permitir inserção fluxo_caixa'
  ) THEN
    CREATE POLICY "Permitir inserção fluxo_caixa"
      ON public.fluxo_caixa FOR INSERT
      TO authenticated, service_role
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fluxo_caixa' AND policyname = 'Permitir atualização fluxo_caixa'
  ) THEN
    CREATE POLICY "Permitir atualização fluxo_caixa"
      ON public.fluxo_caixa FOR UPDATE
      TO authenticated, service_role
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fluxo_caixa' AND policyname = 'Permitir exclusão fluxo_caixa'
  ) THEN
    CREATE POLICY "Permitir exclusão fluxo_caixa"
      ON public.fluxo_caixa FOR DELETE
      TO authenticated, service_role
      USING (true);
  END IF;
END $$;

-- Conceder permissões para os papéis de serviço e autenticados
GRANT ALL ON TABLE public.fluxo_caixa TO service_role, authenticated;
GRANT SELECT ON TABLE public.fluxo_caixa TO anon;
