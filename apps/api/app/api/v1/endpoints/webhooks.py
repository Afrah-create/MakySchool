from fastapi import APIRouter

router = APIRouter()

@router.post("/schoolpay")
async def schoolpay_webhook():
    return {"status": "received"}

@router.post("/makypay")
async def makypay_webhook():
    return {"status": "received"}
