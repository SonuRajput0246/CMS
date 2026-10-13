from sqlalchemy import select
from src.database.session import db_session
from src.api.models.common.login_sliders_model import LoginSliders
from datetime import datetime, timezone

## Image slots are unchanged so the carousel keeps working; only the captions
## are product-neutral. The underlying files are still hotel photography and
## should be replaced with cafe imagery.
sliders = [
    {
        "title": "Welcome to CMS",
        "image_path": "assets/images/login_slider/slider_img_19.avif",
        "alt_text": "Cafe interior",
        "display_order": 1
    },
    {
        "title": "Our Cafe",
        "image_path": "assets/images/login_slider/slider_img_26.webp",
        "alt_text": "Cafe",
        "display_order": 2
    },
    {
        "title": "Service Counter",
        "image_path": "assets/images/login_slider/slider_img_04.avif",
        "alt_text": "Service counter",
        "display_order": 3
    },
    {
        "title": "Dining Area",
        "image_path": "assets/images/login_slider/slider_img_24.avif",
        "alt_text": "Dining area",
        "display_order": 4
    },
    {
        "title": "Fine Dining",
        "image_path": "assets/images/login_slider/slider_img_23.jpg",
        "alt_text": "Restaurant",
        "display_order": 5
    },
    {
        "title": "Buffet",
        "image_path": "assets/images/login_slider/slider_img_17.webp",
        "alt_text": "Buffet",
        "display_order": 6
    },
    {
        "title": "Cafe Service",
        "image_path": "assets/images/login_slider/slider_img_03.webp",
        "alt_text": "Cafe service",
        "display_order": 7
    },
    {
        "title": "Staff",
        "image_path": "assets/images/login_slider/slider_img_16.jpg",
        "alt_text": "Staff",
        "display_order": 8
    },
    {
        "title": "Services",
        "image_path": "assets/images/login_slider/slider_img_07.jpg",
        "alt_text": "Services",
        "display_order": 9
    }
]

def seed_login_sliders():
    try:
        for slide in sliders:
            stmt = select(LoginSliders).filter_by(title=slide["title"], is_deleted=False)
            exists = db_session.execute(stmt).scalar_one_or_none()
            if not exists:
                new_item = LoginSliders(
                    title=slide["title"],
                    image_path=slide["image_path"],
                    alt_text=slide["alt_text"],
                    display_order=slide["display_order"],
                    is_active=True,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                db_session.add(new_item)

        db_session.commit()
        print("--- Login sliders created successfully. ---")
    except Exception as e:
        db_session.rollback()
        print(f"!!! Error seeding login sliders: {str(e)}")
    finally:
        db_session.remove()

if __name__ == "__main__":
    seed_login_sliders()