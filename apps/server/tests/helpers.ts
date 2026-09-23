import request from "supertest";
import { createApp } from "../src/app";

export const app = createApp();

export async function login() {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/login")
    .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
