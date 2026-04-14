<?php

namespace App\Models;

class UserQuery
{
    public function where(string $column, mixed $value): self
    {
        return $this;
    }

    public function get(): array
    {
        return [];
    }
}
