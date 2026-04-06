@Controller("users")
export class UsersController {
  @Get()
  async listUsers() {
    return listUsers();
  }
}
