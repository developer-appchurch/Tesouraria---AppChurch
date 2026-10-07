export type ViewMode = 
  | 'login'
  | 'validar-relatorios'
  | 'relacao-envelopes'
  | 'dashboard'
  | 'permissoes';

/** Nome do setor (unidade pai da célula); vem do cadastro de cada igreja. */
export type SetorTipo = string;

export interface LancamentoTesouraria {
  id: string;
  ID?: string | number;
  igreja_id?: string;
  unidade_id?: string;
  data: string; // YYYY-MM-DD
  dataBR: string; // DD/MM/YYYY
  semanaNumero: number;
  NumSemana?: number | string;
  ano: number;
  mes: number; // 1-12
  celulaNome: string;
  C_x00e9_lula?: string;
  Célula?: string;
  liderCelula?: string;
  L_x00ed_derCelula?: string;
  LiderCelula?: string;
  Setor?: string;
  setor?: string;
  Area?: string;
  area?: string;
  valorPix: number;
  ValorOferta?: number;
  Bairro?: number | string;
  valorEspecie: number;
  OfertaEspecie?: number;
  valorTotal: number;
  Total?: number;
  TESOURARIA_RECEB: boolean;
  tesouraria_recebido?: boolean;
  status: 'CONFIRMADO' | 'PENDENTE';
  DATA_TESOURARIA?: string;
  data_recebimento?: string;
  ID_TESOUREIRO?: string | number;
  tesoureiro_id?: string | number;
  NomeTesoureiro?: string;
  DataCelula?: string;
  DataNascimento?: string;
  Membros?: number;
  Convidados?: number;
  Criancas?: number;
  MembrosPresentes?: number;
  Supervisao?: boolean;
  Criado?: string;
  Created?: string;
  observacoes?: string;
  ativo?: boolean;
}

export type PerfilAcesso = 'admin' | 'tesoureiro_geral' | 'tesoureiro_congregacao' | 'auditor_fiscal' | 'visualizador';

export interface TesourariaPermissaoItem {
  id: string;
  membro_id: string;
  nome: string;
  funcao?: string;
  email?: string;
  criado_em?: string;
}

export interface MembroBuscaItem {
  id: string;
  nome: string;
  funcao?: string;
  email?: string;
}

export interface PermissaoUsuario {
  id: string;
  user_id: string;
  email: string;
  nome: string;
  cargo: string;
  congregacao_nome: string;
  setor?: string;
  perfil: PerfilAcesso;
  acesso_tesouraria_ativo: boolean;
  
  permissoes: {
    validar_relatorios: boolean;
    rejeitar_relatorios: boolean;
    editar_envelopes: boolean;
    visualizar_dashboard: boolean;
    gerenciar_permissoes: boolean;
    exportar_dados: boolean;
    excluir_relatorios: boolean;
    auditar_conferencia: boolean;
  };
  
  ultimo_acesso?: string;
  criado_em: string;
  atualizado_por?: string;
}

export interface AppChurchUser {
  id: string;
  churchId?: string;
  igreja_id?: string;
  name: string;
  login: string;
  role?: string;
  email?: string;
}

export interface MembroItem {
  id: string | number;
  ID?: string | number;
  churchId?: string;
  igreja_id?: string;
  nome: string;
  name?: string;
  login: string;
  role?: string;
  email?: string;
  cargo?: string;
  celula?: string;
  setor?: string;
  area?: string;
  telefone?: string;
  status?: 'Ativo' | 'Inativo';
}

export interface CelulaItem {
  id: string | number;
  ID?: string | number;
  nome: string;
  Celula?: string;
  lider: string;
  ID_Lider?: string | number;
  setor: string;
  Setor?: string;
  area?: string;
  Area?: string;
  Created?: string;
  Criado?: string;
}

export interface UnidadeCadastrada {
  id: string;
  nome: string;
  pai_id: string | null;
  ativo: boolean;
  nivel_tipo_id?: string | null;
  igreja_id?: string | null;
  dia_semana?: string | null;
  lideres?: string[];
  lider_nome?: string | null;
  /** true se a unidade é do nível "célula" da igreja (maior ordem em nivel_tipo) */
  eh_celula?: boolean | null;
}
