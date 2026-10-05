import app from "./app";
import { createServer } from "node:http";
import { logger } from "./lib/logger";
import { attachGameSockets } from "./socket";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
attachGameSockets(server);
server.listen(port, "0.0.0.0", () => {
  logger.info({ port, host: "0.0.0.0" }, "Server listening");
});
