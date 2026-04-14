<?php

namespace App\Services;

use App\Models\User;

class UserService
{
    public static function listUsers(): array
    {
        return User::query()->where('active', true)->get();
    }
}
