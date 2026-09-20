/** Prevents late folder/account requests from mutating the active mail view. */
export class MailViewRequestGuard {
  private generation = 0;
  begin(): number { return this.generation; }
  invalidate(): void { this.generation += 1; }
  isCurrent(requestGeneration: number): boolean { return requestGeneration === this.generation; }
}
