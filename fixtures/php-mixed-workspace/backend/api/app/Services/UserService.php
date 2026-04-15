<?php

namespace App\Services;

use App\Models\User;
use App\Support\HealthReporter;

class UserService
{
    public function listActive(): array
    {
        HealthReporter::record('users');

        return User::query()->where('active', true)->get();
    }

    public function calculateWithService(): int
    {
        $service = new PurchaseDebtCalculationService();

        return $service->calculatePurchaseAmount();
    }
}
