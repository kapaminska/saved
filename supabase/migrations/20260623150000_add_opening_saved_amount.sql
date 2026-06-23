ALTER TABLE public.savings_goals
  ADD COLUMN opening_saved_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
  CHECK (opening_saved_amount >= 0);

UPDATE public.savings_goals g
SET opening_saved_amount = g.saved_amount
WHERE NOT EXISTS (
  SELECT 1 FROM public.goal_payments p WHERE p.goal_id = g.id
);
