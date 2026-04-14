<?php

use Illuminate\Support\Facades\Route;

CRUDBooster::routeController("/", "PosController");

Route::group(array("prefix" => "admin"), function () {
    CRUDBooster::routeController("users", "AdminUsersController");
});

CRUDBooster::routeController(
    "tools",
    "AuditController",
    $namespace = "App\\Http\\Controllers\\Admin",
);
