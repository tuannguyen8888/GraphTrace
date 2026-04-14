<?php

Route::get('/zalo-login', 'ZaloController@login');
Route::get('/info-pawn-order-customers', 'Api\\GoldPawnOrderController@cronjobSendNoticeInterestPayment');

Route::group(array('prefix' => 'admin'), function()
{
    Route::get('/reports', 'AdminReportController@index');
    Route::post('/reports/export', 'AdminReportController@export');
});
