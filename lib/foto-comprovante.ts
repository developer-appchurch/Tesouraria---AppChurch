/**
 * Prepara a foto do comprovante no navegador antes do envio.
 *
 * 1. Lê a foto (inclusive da câmera do celular) respeitando a orientação.
 * 2. Reduz para no máximo 1600 px no lado maior e gera WebP (ou JPEG nos
 *    navegadores que não geram WebP, como o Safari do iPhone).
 * 3. O servidor recodifica SEMPRE em WebP com compressão máxima (meta ~120 KB),
 *    então o arquivo salvo no storage é sempre WebP e pequeno, em qualquer aparelho.
 */

const LADO_MAXIMO = 1600;
const ENVIO_MAXIMO_BYTES = 2.5 * 1024 * 1024;

export interface FotoPreparada {
  /** Conteúdo em base64 (sem o prefixo data:) para enviar à API */
  base64: string;
  /** URL local para pré-visualizar (revogar com URL.revokeObjectURL ao descartar) */
  previewUrl: string;
  tamanhoBytes: number;
}

async function carregarImagem(arquivo: File): Promise<{ fonte: CanvasImageSource; largura: number; altura: number; liberar: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
      return { fonte: bmp, largura: bmp.width, altura: bmp.height, liberar: () => bmp.close() };
    } catch {
      // segue para o <img> (ex.: HEIC no Safari)
    }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não foi possível ler a foto. Tente outra imagem.'));
      el.src = url;
    });
    return { fonte: img, largura: img.naturalWidth, altura: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function canvasParaBlob(canvas: HTMLCanvasElement, tipo: string, qualidade: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), tipo, qualidade));
}

function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).replace(/^data:[^;]+;base64,/, ''));
    leitor.onerror = () => reject(new Error('Falha ao ler a foto.'));
    leitor.readAsDataURL(blob);
  });
}

export async function prepararFotoComprovante(arquivo: File): Promise<FotoPreparada> {
  if (!arquivo.type.startsWith('image/')) {
    throw new Error('Selecione uma foto (imagem).');
  }
  const { fonte, largura, altura, liberar } = await carregarImagem(arquivo);
  try {
    if (!largura || !altura) throw new Error('Foto inválida.');
    const escala = Math.min(1, LADO_MAXIMO / Math.max(largura, altura));
    const w = Math.max(1, Math.round(largura * escala));
    const h = Math.max(1, Math.round(altura * escala));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Seu navegador não conseguiu processar a foto.');
    // Fundo branco: PNG com transparência não vira preto
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(fonte, 0, 0, w, h);

    let blob = await canvasParaBlob(canvas, 'image/webp', 0.82);
    if (!blob || blob.type !== 'image/webp') {
      blob = await canvasParaBlob(canvas, 'image/jpeg', 0.85);
    }
    if (!blob) throw new Error('Não foi possível processar a foto.');
    if (blob.size > ENVIO_MAXIMO_BYTES) {
      blob = (await canvasParaBlob(canvas, 'image/jpeg', 0.6)) || blob;
    }
    if (blob.size > ENVIO_MAXIMO_BYTES) throw new Error('Foto muito grande. Tente outra imagem.');

    return {
      base64: await blobParaBase64(blob),
      previewUrl: URL.createObjectURL(blob),
      tamanhoBytes: blob.size,
    };
  } finally {
    liberar();
  }
}
