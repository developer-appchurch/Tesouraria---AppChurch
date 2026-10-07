import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Deterministic Date Formatter to avoid SSR hydration mismatch
 * Formats YYYY-MM-DD to DD/MM/YYYY
 */
export function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const cleanDate = dateStr.split(' ')[0].split('T')[0];
  const parts = cleanDate.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  return dateStr;
}

/**
 * Deterministic Currency Formatter (R$ X.XXX,XX) to avoid SSR/Client locale discrepancies
 */
export function formatBRL(val: number): string {
  const num = Number(val || 0);
  const formatted = num.toFixed(2).replace('.', ',');
  const parts = formatted.split(',');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${parts.join(',')}`;
}

/**
 * Soma valores em reais sem erro de ponto flutuante: soma em centavos inteiros
 * (ex.: 0.1 + 0.2 = 0.30000000000000004 em número comum).
 */
export function somarReais<T>(itens: T[], valor: (item: T) => number | null | undefined): number {
  let centavos = 0;
  for (const item of itens) centavos += Math.round(Number(valor(item) ?? 0) * 100) || 0;
  return centavos / 100;
}
