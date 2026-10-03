import { BlockList, isIP } from "node:net";

const PRIVATE_RANGES = new BlockList();

PRIVATE_RANGES.addSubnet("127.0.0.0", 8, "ipv4");
PRIVATE_RANGES.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE_RANGES.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE_RANGES.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE_RANGES.addAddress("::1", "ipv6");
PRIVATE_RANGES.addSubnet("fc00::", 7, "ipv6");
PRIVATE_RANGES.addSubnet("fe80::", 10, "ipv6");

const MAPPED_PREFIX = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

export function isPrivateAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }

  const mapped = MAPPED_PREFIX.exec(address);
  const candidate = mapped?.[1] ?? address;
  const version = isIP(candidate);

  if (version === 0) {
    return false;
  }

  return PRIVATE_RANGES.check(candidate, version === 4 ? "ipv4" : "ipv6");
}

// Confia no proxy direto só se ele estiver em rede privada; os demais saltos são contados.
export function trustHops(hops: number): boolean | ((address: string, index: number) => boolean) {
  if (hops <= 0) {
    return false;
  }

  return (address, index) => {
    if (index === 0) {
      return isPrivateAddress(address);
    }

    return index < hops;
  };
}
