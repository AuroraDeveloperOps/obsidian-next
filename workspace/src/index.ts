import { UserService } from "./services/userService";
import { logger } from "./utils/logger";

async function main() {
  const userService = new UserService();

  try {
    const alice = userService.createUser({
      name: "Alice",
      email: "alice@example.com"
    });

    const bob = userService.createUser({
      name: "Bob",
      email: "bob@example.com"
    });

    logger.info("All users", { count: userService.getAllUsers().length });

    userService.updateUser(alice.id, { email: "alice.updated@example.com" });

    logger.info("User fetched", userService.getUser(alice.id));

    logger.info("Application started successfully");
  } catch (error) {
    if (error instanceof Error) {
      logger.error("Application error", { message: error.message });
    }
    process.exit(1);
  }
}

main();
