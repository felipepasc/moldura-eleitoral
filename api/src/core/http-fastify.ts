import type { FastifyReply } from "fastify";

export function ok<T>(reply: FastifyReply, data: T) {
  return reply.code(200).send(data);
}

export function created<T>(reply: FastifyReply, data: T) {
  return reply.code(201).send(data);
}

export function badReq(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: message });
}

export function unauthorized(reply: FastifyReply, message: string) {
  return reply.code(401).send({ error: message });
}

export function notFound(reply: FastifyReply, message: string) {
  return reply.code(404).send({ error: message });
}

export function tooLarge(reply: FastifyReply, message: string) {
  return reply.code(413).send({ error: message });
}

export function badGateway(reply: FastifyReply, message: string) {
  return reply.code(502).send({ error: message });
}

export function serverErr(reply: FastifyReply, message = "Erro interno. Tente de novo em instantes.") {
  return reply.code(500).send({ error: message });
}
