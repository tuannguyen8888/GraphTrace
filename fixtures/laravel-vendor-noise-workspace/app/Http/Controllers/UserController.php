<?php

namespace App\Http\Controllers;

use App\Services\UserService;

class UserController
{
    public function index(): array
    {
        return UserService::listUsers();
    }
}
