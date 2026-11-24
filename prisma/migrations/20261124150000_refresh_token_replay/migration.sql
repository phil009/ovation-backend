-- Refresh retries: remember which token replaced which, plus the replacement sealed with the old token.
ALTER TABLE "refresh_tokens" ADD COLUMN "replacedById" TEXT,
ADD COLUMN "successorSealed" TEXT;

CREATE UNIQUE INDEX "refresh_tokens_replacedById_key" ON "refresh_tokens"("replacedById");

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
