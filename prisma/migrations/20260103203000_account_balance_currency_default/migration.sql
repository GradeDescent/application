-- Set default currency to USD for account balances
ALTER TABLE "AccountBalance" ALTER COLUMN "currency" SET DEFAULT 'USD';
