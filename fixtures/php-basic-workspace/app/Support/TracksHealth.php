<?php

namespace App\Support;

trait TracksHealth
{
    protected function buildStatus(): string
    {
        return 'ok';
    }
}
