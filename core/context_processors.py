from django.conf import settings


def website_name(request):
    return {"WEBSITE_NAME": settings.WEBSITE_NAME}
