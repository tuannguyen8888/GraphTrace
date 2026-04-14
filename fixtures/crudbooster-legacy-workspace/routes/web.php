<?php

use App\Http\Controllers\AdminUsersController;
use Illuminate\Support\Facades\Route;

Route::get('/admin/users', [AdminUsersController::class, 'getIndex']);
Route::get('/admin/users/add', [AdminUsersController::class, 'getAdd']);
Route::post('/admin/users/add', [AdminUsersController::class, 'postAdd']);
