<?php

namespace App\Http\Controllers;

use App\Models\User;

class AdminUsersController extends CBController
{
    public function cbInit(): void
    {
        $this->table = 'users';
        $this->model = User::class;
    }

    public function getIndex(): array
    {
        return User::query()->where('active', 1)->get();
    }

    public function getAdd(): array
    {
        return [];
    }

    public function postAdd(): User
    {
        return new User();
    }
}
