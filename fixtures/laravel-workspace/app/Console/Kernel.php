<?php

namespace App\Console;

use App\Console\Commands\ForceSyncTableCommand;

class Kernel
{
    protected $commands = [
        ForceSyncTableCommand::class,
    ];
}
