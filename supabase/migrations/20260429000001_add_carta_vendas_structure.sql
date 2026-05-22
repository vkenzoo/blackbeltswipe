-- Add 'carta_vendas' (sales letter) to allowed offer structures.
--
-- Carta de Vendas = página longa de texto/imagens sem VSL no topo.
-- Usado quando admin sinaliza "Sem VSL" no modal de upload, ou pra
-- ofertas que historicamente são sales letter (Russell Brunson style).
--
-- Mantém os 4 valores existentes (vsl, quiz, low_ticket, infoproduto)
-- + adiciona carta_vendas.

ALTER TABLE public.offers
  DROP CONSTRAINT IF EXISTS offers_structure_check;

ALTER TABLE public.offers
  ADD CONSTRAINT offers_structure_check
  CHECK (structure IN ('vsl', 'quiz', 'low_ticket', 'infoproduto', 'carta_vendas'));
