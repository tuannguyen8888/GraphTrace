<?php

namespace App\Models;

class User extends BaseModel
{
    public static function query(): UserQuery
    {
        return new UserQuery();
    }
}
