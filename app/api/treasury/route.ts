import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase';
import { converterItemParaLancamento } from '@/lib/treasury-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, params = {} } = body;
    const supabase = getServerSupabaseClient();

    switch (action) {
      case 'relatorios_detalhados': {
        const { ano, mes, somentePendentes } = params;
        const isTodosAnos =
          !ano || String(ano).toLowerCase() === 'todos' || String(ano).toLowerCase() === 'todos os anos';
        const pAno = isTodosAnos ? null : Number(ano) || new Date().getFullYear();
        const pMes = mes !== null && mes !== undefined && mes !== 'todos' && mes !== '' ? Number(mes) : null;
        const pSomentePendentes = typeof somentePendentes === 'boolean' ? somentePendentes : null;

        let query = supabase
          .from('relatorios_semanais')
          .select('id, igreja_id, data_relatorio, numero_semana, valor_pix, valor_especie, observacao, data_recebimento, tesoureiro_id, tesouraria_recebido, criado_em')
          .order('data_relatorio', { ascending: false })
          .limit(10000);

        if (pSomentePendentes === true) {
          query = query.or('tesouraria_recebido.eq.false,tesouraria_recebido.is.null');
        } else if (pSomentePendentes === false) {
          query = query.eq('tesouraria_recebido', true);
        }

        const { data, error } = await query;
        if (error) {
          return NextResponse.json({ success: false, data: [], error: error.message }, { status: 400 });
        }

        let itemsFiltrados = data || [];
        itemsFiltrados = itemsFiltrados.filter((item: any) => {
          let itemAno = new Date().getFullYear();
          let itemMes = new Date().getMonth() + 1;
          if (item.data_relatorio) {
            const clean = String(item.data_relatorio).split('T')[0];
            const parts = clean.split('-');
            if (parts.length === 3) {
              itemAno = parseInt(parts[0], 10);
              itemMes = parseInt(parts[1], 10);
            }
          }

          if (!isTodosAnos && pAno !== null && itemAno !== pAno) return false;
          if (pMes !== null && itemMes !== pMes) return false;
          return true;
        });

        const list = itemsFiltrados.map((item: any, idx: number) => {
          const l = converterItemParaLancamento(item, idx);
          return {
            id: String(item.id),
            unidade_id: item.unidade_id ? String(item.unidade_id) : undefined,
            celula_nome: String(l.celulaNome || 'Célula'),
            lideres: String(l.liderCelula || '-'),
            data_relatorio: String(item.data_relatorio || l.data),
            valor_pix: Number(item.valor_pix ?? 0),
            valor_especie: Number(item.valor_especie ?? 0),
            tesouraria_recebido: item.tesouraria_recebido === true,
            data_recebimento: item.data_recebimento || null,
            tesoureiro_id: item.tesoureiro_id || null,
            nome_tesoureiro: l.NomeTesoureiro || null,
          };
        });

        return NextResponse.json({ success: true, data: list });
      }

      case 'resumo': {
        const { ano, mes } = params;
        const isTodosAnos =
          !ano || String(ano).toLowerCase() === 'todos' || String(ano).toLowerCase() === 'todos os anos';
        const pAno = isTodosAnos ? null : Number(ano) || new Date().getFullYear();
        const pMes = mes !== null && mes !== undefined && mes !== 'todos' && mes !== '' ? Number(mes) : null;

        const { data: allRows, error } = await supabase
          .from('relatorios_semanais')
          .select('id, data_relatorio, tesouraria_recebido')
          .limit(10000);

        if (error) {
          return NextResponse.json({ success: false, data: { pendentes: 0, confirmados: 0 }, error: error.message }, { status: 400 });
        }

        let pendentes = 0;
        let confirmados = 0;

        if (allRows && Array.isArray(allRows)) {
          allRows.forEach((r: any) => {
            let itemAno = new Date().getFullYear();
            let itemMes = new Date().getMonth() + 1;
            if (r.data_relatorio) {
              const clean = String(r.data_relatorio).split('T')[0];
              const parts = clean.split('-');
              if (parts.length === 3) {
                itemAno = parseInt(parts[0], 10);
                itemMes = parseInt(parts[1], 10);
              }
            }

            if (!isTodosAnos && pAno !== null && itemAno !== pAno) return;
            if (pMes !== null && itemMes !== pMes) return;

            if (r.tesouraria_recebido === true) {
              confirmados++;
            } else {
              pendentes++;
            }
          });
        }

        return NextResponse.json({ success: true, data: { pendentes, confirmados } });
      }

      case 'setores_pendencias': {
        const { ano, mes } = params;
        const isTodosAnos =
          !ano || String(ano).toLowerCase() === 'todos' || String(ano).toLowerCase() === 'todos os anos';
        const pAno = isTodosAnos ? null : Number(ano) || new Date().getFullYear();
        const pMes = mes !== null && mes !== undefined && mes !== 'todos' && mes !== '' ? Number(mes) : null;

        const { data: allRows, error } = await supabase
          .from('relatorios_semanais')
          .select('id, data_relatorio, tesouraria_recebido, observacao')
          .limit(10000);

        if (error) {
          return NextResponse.json({ success: false, data: [], error: error.message }, { status: 400 });
        }

        const setoresMap = new Map<string, number>();
        const setoresPadrao = ['Safira', 'Fire', 'White', 'Black', 'Azul', 'Amarelo', 'Legacy', 'Onix', 'Diamante', 'Titanium'];
        setoresPadrao.forEach((s) => setoresMap.set(s, 0));

        if (allRows && Array.isArray(allRows)) {
          allRows.forEach((r: any) => {
            let itemAno = new Date().getFullYear();
            let itemMes = new Date().getMonth() + 1;
            if (r.data_relatorio) {
              const clean = String(r.data_relatorio).split('T')[0];
              const parts = clean.split('-');
              if (parts.length === 3) {
                itemAno = parseInt(parts[0], 10);
                itemMes = parseInt(parts[1], 10);
              }
            }

            if (!isTodosAnos && pAno !== null && itemAno !== pAno) return;
            if (pMes !== null && itemMes !== pMes) return;

            if (r.tesouraria_recebido !== true) {
              let setor = 'Safira';
              const obs = String(r.observacao || '');
              if (obs.toLowerCase().includes('setor:')) {
                const match = obs.match(/setor:\s*([^|]+)/i);
                if (match) setor = match[1].trim();
              }
              setoresMap.set(setor, (setoresMap.get(setor) || 0) + 1);
            }
          });
        }

        const list = Array.from(setoresMap.entries()).map(([nome, qtd]) => ({
          setor_id: nome,
          setor_nome: nome,
          qtd_pendentes: qtd,
        }));

        return NextResponse.json({ success: true, data: list });
      }

      case 'confirmar_individual': {
        const { id, userId } = params;
        const nowIso = new Date().toISOString();
        const { error } = await supabase
          .from('relatorios_semanais')
          .update({
            tesouraria_recebido: true,
            data_recebimento: nowIso,
            tesoureiro_id: String(userId || '1'),
            atualizado_em: nowIso,
          })
          .eq('id', id);

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }
        return NextResponse.json({ success: true });
      }

      case 'desconfirmar_individual': {
        const { id } = params;
        const nowIso = new Date().toISOString();
        const { error } = await supabase
          .from('relatorios_semanais')
          .update({
            tesouraria_recebido: false,
            data_recebimento: null,
            tesoureiro_id: null,
            atualizado_em: nowIso,
          })
          .eq('id', id);

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }
        return NextResponse.json({ success: true });
      }

      case 'confirmar_massa': {
        const { ids, userId } = params;
        if (!Array.isArray(ids) || ids.length === 0) {
          return NextResponse.json({ success: true, count: 0 });
        }
        const nowIso = new Date().toISOString();
        const { error } = await supabase
          .from('relatorios_semanais')
          .update({
            tesouraria_recebido: true,
            data_recebimento: nowIso,
            tesoureiro_id: String(userId || '1'),
            atualizado_em: nowIso,
          })
          .in('id', ids);

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }
        return NextResponse.json({ success: true, count: ids.length });
      }

      case 'atualizar_valores': {
        const { id, valorPix, valorEspecie } = params;
        const nowIso = new Date().toISOString();
        const { error } = await supabase
          .from('relatorios_semanais')
          .update({
            valor_pix: Number(valorPix ?? 0),
            valor_especie: Number(valorEspecie ?? 0),
            atualizado_em: nowIso,
          })
          .eq('id', id);

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }
        return NextResponse.json({ success: true });
      }

      case 'excluir': {
        const { id } = params;
        const { error } = await supabase.from('relatorios_semanais').delete().eq('id', id);
        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ success: false, error: 'Ação não reconhecida.' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[API /api/treasury] Erro:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Erro interno no servidor.' }, { status: 500 });
  }
}
