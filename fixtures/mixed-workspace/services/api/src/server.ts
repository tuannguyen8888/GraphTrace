import express from "express";

const app = express();

app.get("/ping", (_req, res) => {
  res.json({ ok: true });
});

export default app;
