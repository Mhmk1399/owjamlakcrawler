export class ContactProvider {
  async isAvailable() {
    return false;
  }

  async enrichContact() {
    return null;
  }
}

export function createContactProvider() {
  return null;
}
