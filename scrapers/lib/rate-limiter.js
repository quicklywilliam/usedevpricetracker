export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class RateLimiter {
  constructor(delayMs = 3000) {
    this.delayMs = delayMs;
    this.lastRequestTime = 0;
  }

  async waitIfNeeded() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.delayMs) {
      const waitTime = this.delayMs - timeSinceLastRequest;
      await sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
  }
}
