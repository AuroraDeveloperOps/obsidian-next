import { UserService } from "../src/services/userService";

describe("UserService", () => {
  let service: UserService;

  beforeEach(() => {
    service = new UserService();
  });

  test("should create a user", () => {
    const user = service.createUser({
      name: "Alice",
      email: "alice@example.com"
    });

    expect(user.id).toBe(1);
    expect(user.name).toBe("Alice");
    expect(user.email).toBe("alice@example.com");
  });

  test("should get user by id", () => {
    service.createUser({ name: "Alice", email: "alice@example.com" });
    const user = service.getUser(1);

    expect(user).toBeDefined();
    expect(user?.name).toBe("Alice");
  });

  test("should return all users", () => {
    service.createUser({ name: "Alice", email: "alice@example.com" });
    service.createUser({ name: "Bob", email: "bob@example.com" });

    const users = service.getAllUsers();
    expect(users).toHaveLength(2);
  });
});
