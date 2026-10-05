import { CelulaItem, LancamentoTesouraria } from './types';

export interface CelulaCatalogo extends CelulaItem {
  setor: string;
  lider: string;
  area: string;
  diaEncontro: string;
  horario: string;
  bairro: string;
}

export const LISTA_CELULAS: CelulaCatalogo[] = [
  // Setor Safira
  { id: 'cel-1', nome: 'Célula Betel', setor: 'Safira', lider: 'Junio Fonteles', area: 'Área 01', diaEncontro: 'Quarta-feira', horario: '19:30', bairro: 'Centro' },
  { id: 'cel-2', nome: 'Célula Kadosh', setor: 'Safira', lider: 'Amanda Ferreira', area: 'Área 01', diaEncontro: 'Quinta-feira', horario: '20:00', bairro: 'Derby' },
  { id: 'cel-3', nome: 'Célula Peniel', setor: 'Safira', lider: 'Carlos Eduardo', area: 'Área 02', diaEncontro: 'Sexta-feira', horario: '19:30', bairro: 'Campo dos Velhos' },
  { id: 'cel-4', nome: 'Célula Moriá', setor: 'Safira', lider: 'Débora Rocha', area: 'Área 02', diaEncontro: 'Quarta-feira', horario: '20:00', bairro: 'Pedrinhas' },
  { id: 'cel-5', nome: 'Célula Shalon', setor: 'Safira', lider: 'Marcos Vinícius', area: 'Área 03', diaEncontro: 'Sábado', horario: '18:00', bairro: 'Sinhá Sabóia' },

  // Setor Fire
  { id: 'cel-6', nome: 'Célula Fire 01', setor: 'Fire', lider: 'Lucas Gabriel', area: 'Área Fire Norte', diaEncontro: 'Sábado', horario: '19:00', bairro: 'Junco' },
  { id: 'cel-7', nome: 'Célula Fire 02', setor: 'Fire', lider: 'Matheus Silva', area: 'Área Fire Sul', diaEncontro: 'Sábado', horario: '19:30', bairro: 'Centro' },
  { id: 'cel-8', nome: 'Célula Shekinah', setor: 'Fire', lider: 'Felipe Nogueira', area: 'Área Fire Leste', diaEncontro: 'Sexta-feira', horario: '20:00', bairro: 'Cohab II' },
  { id: 'cel-9', nome: 'Célula Aviva', setor: 'Fire', lider: 'Larissa Costa', area: 'Área Fire Sul', diaEncontro: 'Quinta-feira', horario: '19:30', bairro: 'Renascença' },

  // Setor White
  { id: 'cel-10', nome: 'Célula Alpha', setor: 'White', lider: 'Rafael Albuquerque', area: 'Área White 01', diaEncontro: 'Quinta-feira', horario: '19:30', bairro: 'Domingos Olímpio' },
  { id: 'cel-11', nome: 'Célula Ômega', setor: 'White', lider: 'Tiago Mendes', area: 'Área White 01', diaEncontro: 'Quarta-feira', horario: '20:00', bairro: 'Expectativa' },
  { id: 'cel-12', nome: 'Célula Emanuel', setor: 'White', lider: 'Juliana Paiva', area: 'Área White 02', diaEncontro: 'Sexta-feira', horario: '19:30', bairro: 'Parque Silvana' },

  // Setor Black
  { id: 'cel-13', nome: 'Célula Black Lion', setor: 'Black', lider: 'Bruno Castro', area: 'Área Black 01', diaEncontro: 'Sábado', horario: '18:30', bairro: 'Campo dos Velhos' },
  { id: 'cel-14', nome: 'Célula Metanoia', setor: 'Black', lider: 'Diego Duarte', area: 'Área Black 01', diaEncontro: 'Sexta-feira', horario: '20:00', bairro: 'Derby' },
  { id: 'cel-15', nome: 'Célula Resgate', setor: 'Black', lider: 'Vanessa Pontes', area: 'Área Black 02', diaEncontro: 'Quinta-feira', horario: '19:30', bairro: 'Dom Expedito' },

  // Setor Azul
  { id: 'cel-16', nome: 'Célula Monte Sião', setor: 'Azul', lider: 'Paulo Henrique', area: 'Área Azul 01', diaEncontro: 'Quarta-feira', horario: '19:30', bairro: 'Centro' },
  { id: 'cel-17', nome: 'Célula Ebenézer', setor: 'Azul', lider: 'Gabriel Aragão', area: 'Área Azul 01', diaEncontro: 'Quinta-feira', horario: '20:00', bairro: 'Pedrinhas' },
  { id: 'cel-18', nome: 'Célula Fonte de Vida', setor: 'Azul', lider: 'Samuel Ramos', area: 'Área Azul 02', diaEncontro: 'Sexta-feira', horario: '19:30', bairro: 'Sumaré' },

  // Setor Amarelo
  { id: 'cel-19', nome: 'Célula Luz do Mundo', setor: 'Amarelo', lider: 'Fernando Torres', area: 'Área Amarelo 01', diaEncontro: 'Quinta-feira', horario: '19:30', bairro: 'Sinhá Sabóia' },
  { id: 'cel-20', nome: 'Célula Renascer', setor: 'Amarelo', lider: 'Priscila Medeiros', area: 'Área Amarelo 01', diaEncontro: 'Sexta-feira', horario: '20:00', bairro: 'Cohab I' },

  // Setor Legacy
  { id: 'cel-21', nome: 'Célula Legacy 01', setor: 'Legacy', lider: 'Leandro Soares', area: 'Área Legacy 01', diaEncontro: 'Sábado', horario: '19:00', bairro: 'Centro' },
  { id: 'cel-22', nome: 'Célula Conexão', setor: 'Legacy', lider: 'Beatriz Farias', area: 'Área Legacy 01', diaEncontro: 'Quinta-feira', horario: '19:30', bairro: 'Junco' },

  // Setor Onix
  { id: 'cel-23', nome: 'Célula Fortaleza', setor: 'Onix', lider: 'André Lima', area: 'Área Onix 01', diaEncontro: 'Sexta-feira', horario: '19:30', bairro: 'Derby' },
  { id: 'cel-24', nome: 'Célula Atos 2', setor: 'Onix', lider: 'Nathalia Souza', area: 'Área Onix 01', diaEncontro: 'Quarta-feira', horario: '20:00', bairro: 'Alto da Brasília' },

  // Setor Diamante
  { id: 'cel-25', nome: 'Célula Preciosas', setor: 'Diamante', lider: 'Camila Carneiro', area: 'Área Diamante 01', diaEncontro: 'Quinta-feira', horario: '19:30', bairro: 'Centro' },
  { id: 'cel-26', nome: 'Célula Koinonia', setor: 'Diamante', lider: 'Daniel Frota', area: 'Área Diamante 01', diaEncontro: 'Sábado', horario: '18:00', bairro: 'Campo dos Velhos' },

  // Setor Titanium
  { id: 'cel-27', nome: 'Célula Rocha Eterna', setor: 'Titanium', lider: 'Marcelo Vieira', area: 'Área Titanium 01', diaEncontro: 'Sexta-feira', horario: '20:00', bairro: 'Pedrinhas' },
  { id: 'cel-28', nome: 'Célula Graça & Paz', setor: 'Titanium', lider: 'Leonardo Vasconcelos', area: 'Área Titanium 01', diaEncontro: 'Quarta-feira', horario: '19:30', bairro: 'Expectativa' },
];

/**
 * Gera lançamentos demonstrativos com valores realistas de PIX, Espécie e Totais
 * para semanas de 2026 (Semana 35 a Semana 40)
 */
export function gerarRelatoriosIniciais(): LancamentoTesouraria[] {
  const semanas = [
    { num: 40, dataBR: '04/10/2026', dataIso: '2026-10-04', mes: 10 },
    { num: 39, dataBR: '27/09/2026', dataIso: '2026-09-27', mes: 9 },
    { num: 38, dataBR: '20/09/2026', dataIso: '2026-09-20', mes: 9 },
    { num: 37, dataBR: '13/09/2026', dataIso: '2026-09-13', mes: 9 },
    { num: 36, dataBR: '06/09/2026', dataIso: '2026-09-06', mes: 9 },
    { num: 35, dataBR: '30/08/2026', dataIso: '2026-08-30', mes: 8 },
  ];

  const lancamentos: LancamentoTesouraria[] = [];
  let counter = 100;

  for (const sem of semanas) {
    for (const cel of LISTA_CELULAS) {
      counter++;
      const id = `dem-${sem.num}-${cel.id}-${counter}`;
      
      // Gera valores coerentes baseados no nome da célula e semana
      const baseSeed = (cel.nome.length * 37 + sem.num * 41) % 100;
      const pix = 120 + baseSeed * 5.5; // Entre R$ 120 e R$ 670
      const especie = 40 + (baseSeed % 35) * 8; // Entre R$ 40 e R$ 320
      const total = pix + especie;
      
      // Semanas mais antigas estão todas confirmadas; a semana 40 tem algumas pendentes
      const isConfirmado = sem.num < 40 || (baseSeed % 3 !== 0);
      const dataReceb = isConfirmado ? sem.dataBR : undefined;
      const idTesoureiro = isConfirmado ? '4' : undefined;
      const nomeTesoureiro = isConfirmado ? 'Junio Fonteles' : undefined;

      lancamentos.push({
        id,
        ID: counter,
        data: sem.dataIso,
        dataBR: sem.dataBR,
        semanaNumero: sem.num,
        NumSemana: sem.num,
        ano: 2026,
        mes: sem.mes,
        celulaNome: cel.nome,
        Célula: cel.nome,
        C_x00e9_lula: cel.nome,
        liderCelula: cel.lider,
        LiderCelula: cel.lider,
        setor: cel.setor,
        Setor: cel.setor,
        area: cel.area,
        Area: cel.area,
        valorPix: Math.round(pix * 100) / 100,
        ValorOferta: Math.round(pix * 100) / 100,
        valorEspecie: Math.round(especie * 100) / 100,
        OfertaEspecie: Math.round(especie * 100) / 100,
        valorTotal: Math.round(total * 100) / 100,
        Total: Math.round(total * 100) / 100,
        TESOURARIA_RECEB: isConfirmado,
        status: isConfirmado ? 'CONFIRMADO' : 'PENDENTE',
        DATA_TESOURARIA: dataReceb,
        ID_TESOUREIRO: idTesoureiro,
        NomeTesoureiro: nomeTesoureiro,
        Membros: 8 + (baseSeed % 12),
        Criancas: 1 + (baseSeed % 5),
        observacoes: `${cel.nome} | Setor: ${cel.setor} | Líder: ${cel.lider}`,
      });
    }
  }

  return lancamentos;
}

/**
 * Gera o script SQL pronto para rodar no Supabase SQL Editor
 * para popular a tabela public.relatorios_semanais com os dados
 */
export function gerarSqlPopulacaoSupabase(): string {
  const relatorios = gerarRelatoriosIniciais().slice(0, 56); // 56 relatórios mais recentes
  const igrejaId = 'ff600f5f-b91f-4826-bde2-3976e718877c';

  const valoresSql = relatorios.map((r) => {
    const dataRecebVal = r.DATA_TESOURARIA ? `'${r.DATA_TESOURARIA}'` : 'NULL';
    const tesoureiroVal = r.ID_TESOUREIRO ? `'${r.ID_TESOUREIRO}'` : 'NULL';
    const obs = `${r.celulaNome} | Setor: ${r.setor} | Líder: ${r.liderCelula}`.replace(/'/g, "''");

    return `  ('${igrejaId}', '${r.data}', ${r.valorPix.toFixed(2)}, ${r.valorEspecie.toFixed(2)}, ${r.Membros || 10}, ${r.Criancas || 2}, '${obs}', ${dataRecebVal}, ${tesoureiroVal})`;
  }).join(',\n');

  return `-- ==============================================================
-- POPULAR TABELA relatorios_semanais NO SUPABASE
-- URL: https://supabase.com/dashboard/project/srjkwwddbxniqhzqvrhc/editor/21491?schema=public
-- ==============================================================

-- 1. Desativar RLS para permitir leitura e escrita pelo app
ALTER TABLE public.relatorios_semanais DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissoes DISABLE ROW LEVEL SECURITY;

-- 2. Inserir relatórios semanais com valores de PIX, Espécie e Células
INSERT INTO public.relatorios_semanais (
  igreja_id,
  data_relatorio,
  valor_pix,
  valor_especie,
  qtd_membros,
  qtd_criancas,
  observacao,
  data_recebimento,
  tesoureiro_id
) VALUES
${valoresSql};
`;
}
