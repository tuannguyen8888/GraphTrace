import express from "express";
import { createRouter } from "./routes/users.js";

const app = express();

app.use(createRouter());

export default app;
