<?php

namespace App\Http\Controllers;

use App\Contracts\ChecksHealth;
use App\Support\TracksHealth;

final class HealthController implements ChecksHealth
{
    use TracksHealth;

    public function __invoke(): string
    {
        return $this->show();
    }

    public function show(): string
    {
        return $this->buildStatus();
    }
}
