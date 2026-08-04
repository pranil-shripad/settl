import dotenv from "dotenv";
import app from "./app.js";
import { logger } from "./logger.js";

dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || "development" }, `Settl backend API server listening on port ${PORT}`);
});
