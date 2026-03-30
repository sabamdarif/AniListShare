from django.contrib.auth.decorators import login_required
from django.shortcuts import render

@login_required
def account_settings(request):
    return render(request, "account/settings.html")

@login_required
def account_delete(request):
    return render(request, "account/delete.html")
