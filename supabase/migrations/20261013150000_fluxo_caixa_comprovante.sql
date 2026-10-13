-- Comprovante (foto) dos lançamentos do Fluxo de Caixa
--
-- * A foto é sempre gravada como WebP, já comprimida pelo servidor (/api/treasury),
--   num bucket PRIVADO. A tabela guarda só o caminho do arquivo (texto curto).
-- * Caminho: <igreja_id>/<id_do_lancamento>/<uuid>.webp
-- * Sem políticas de acesso no storage.objects para este bucket: só o servidor
--   (chave de serviço) lê e grava. O navegador vê a foto por um link assinado
--   que expira em poucos minutos, gerado depois de conferir a igreja do usuário.

alter table public.fluxo_caixa
  add column if not exists "ComprovanteFluxo" text;

comment on column public.fluxo_caixa."ComprovanteFluxo" is
  'Caminho do comprovante (WebP) no bucket privado tesouraria-comprovantes';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tesouraria-comprovantes', 'tesouraria-comprovantes', false, 307200, array['image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
