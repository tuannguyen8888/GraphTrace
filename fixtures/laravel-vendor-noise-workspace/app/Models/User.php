<?php

namespace App\Models;

class User
{
    public static function query(): UserQuery
    {
        return new UserQuery();
    }
}
