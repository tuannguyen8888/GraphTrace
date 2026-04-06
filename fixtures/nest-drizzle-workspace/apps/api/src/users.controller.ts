import { listUsers } from "./users.service.js";

@Controller("users")
export class UsersController {
  @Get()
  async listUsers() {
    return listUsers();
  }
}
