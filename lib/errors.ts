/**
 * Human-readable error translation for Straws
 * Maps contract revert errors and viem/wagmi exceptions into clear user feedback
 */

export const REVERT_MESSAGES: Record<string, string> = {
  BadReveal: "That isn't the secret you sealed.",
  Closed: "This draw is full or closed.",
  AlreadyJoined: "You have already taken a straw in this draw.",
  NotEntrant: "You did not join this draw.",
  AlreadyRevealed: "You have already revealed your secret.",
  TooEarly: "It's too early to draw. Entrants are still revealing.",
  AlreadyDrawn: "This draw has already been decided.",
  NoSuchDraw: "That draw does not exist.",
  ZeroCommitment: "Commitment cannot be empty.",
  NotRevealPhase: "Reveals are not open yet.",
  BadSlots: "Draw must have between 2 and 16 slots.",
  BadWindow: "Join window must be 5m–7d, reveal window 5m–3d.",
  TitleTooLong: "Title must be 64 bytes or fewer.",
};

export function describeError(err: unknown): string {
  if (!err) return "An unexpected error occurred.";

  const message = err instanceof Error ? err.message : String(err);

  for (const [errorName, translation] of Object.entries(REVERT_MESSAGES)) {
    if (message.includes(errorName)) {
      return translation;
    }
  }

  if (/user rejected|rejected transaction|denied transaction/i.test(message)) {
    return "Transaction was cancelled in your wallet.";
  }

  if (/insufficient funds/i.test(message)) {
    return "Insufficient BOT balance for transaction gas.";
  }

  return message.length > 120 ? `${message.slice(0, 117)}...` : message;
}

export const describeContractError = describeError;
