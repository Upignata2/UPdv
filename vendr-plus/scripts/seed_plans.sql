CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price NUMERIC(10,2) NOT NULL,
  annual_price NUMERIC(10,2) NOT NULL,
  limit_products INTEGER,
  limit_customers INTEGER,
  coupon BOOLEAN NOT NULL DEFAULT FALSE,
  nota BOOLEAN NOT NULL DEFAULT FALSE,
  support TEXT NOT NULL,
  promo TEXT
);

INSERT INTO plans (id, name, monthly_price, annual_price, limit_products, limit_customers, coupon, nota, support, promo) VALUES
('gratis', 'Grátis', 0, 0, 80, 80, FALSE, FALSE, 'none', ''),
('basico', 'Básico', 49.9, 499, 200, 200, TRUE, TRUE, 'limited', ''),
('elite', 'Elite', 99.9, 999, NULL, NULL, TRUE, TRUE, 'full', '')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_price = EXCLUDED.monthly_price,
  annual_price = EXCLUDED.annual_price,
  limit_products = EXCLUDED.limit_products,
  limit_customers = EXCLUDED.limit_customers,
  coupon = EXCLUDED.coupon,
  nota = EXCLUDED.nota,
  support = EXCLUDED.support,
  promo = EXCLUDED.promo;
