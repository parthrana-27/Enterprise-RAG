import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.models import User, AuditLog
from app.schemas.schemas import UserCreate, UserResponse, UserLogin, Token, TokenData

router = APIRouter(prefix="/auth", tags=["auth"])

import bcrypt

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login-oauth2")

# Password Helpers
def get_password_hash(password: str) -> str:
    # Encode password to bytes and generate salt
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        pwd_bytes = plain_password.encode("utf-8")
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False

# JWT Token Helpers
def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# Role Hierarchy Helper
ROLE_LEVELS = {
    settings.ROLE_EMPLOYEE: 1,
    settings.ROLE_MANAGER: 2,
    settings.ROLE_ADMIN: 3
}

def has_required_role(user_role: str, required_role: str) -> bool:
    user_level = ROLE_LEVELS.get(user_role, 0)
    req_level = ROLE_LEVELS.get(required_role, 0)
    return user_level >= req_level

# Dependency to fetch authenticated user
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username, role=payload.get("role"))
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.username == token_data.username).first()
    if user is None:
        raise credentials_exception
    return user

# Dependency for strict role enforcement
class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        # Check if the user's role is in the allowed roles list, or if their hierarchy level satisfies it
        authorized = False
        for role in self.allowed_roles:
            if has_required_role(current_user.role, role):
                authorized = True
                break
        
        if not authorized:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action requires one of the roles: {self.allowed_roles}. Current role: {current_user.role}."
            )
        return current_user

# Endpoints
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(user_in: UserCreate, db: Session = Depends(get_db)):
    # Check if username exists
    existing_user = db.query(User).filter(User.username == user_in.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered."
        )
    
    # Hash password and create user
    hashed_password = get_password_hash(user_in.password)
    role = user_in.role
    if role not in ROLE_LEVELS:
        role = settings.ROLE_EMPLOYEE

    db_user = User(
        username=user_in.username,
        password_hash=hashed_password,
        role=role,
        department=user_in.department
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    # Log action
    audit_log = AuditLog(
        user_id=db_user.id,
        action="REGISTER",
        target_type="USER",
        target_id=str(db_user.id),
        details=f"Registered new user: {db_user.username} as role {db_user.role}"
    )
    db.add(audit_log)
    db.commit()

    return db_user

@router.post("/login", response_model=Token)
def login(user_in: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == user_in.username).first()
    if not user or not verify_password(user_in.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Generate Token
    access_token_expires = datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role, "uid": user.id}, 
        expires_delta=access_token_expires
    )

    # Log action
    audit_log = AuditLog(
        user_id=user.id,
        action="LOGIN",
        target_type="USER",
        target_id=str(user.id),
        details=f"User {user.username} logged in successfully"
    )
    db.add(audit_log)
    db.commit()

    return {"access_token": access_token, "token_type": "bearer"}

# Endpoint supporting OAuth2 standard format for Swagger UI / API tools
from fastapi.security import OAuth2PasswordRequestForm
@router.post("/login-oauth2", response_model=Token)
def login_oauth2(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    return login(UserLogin(username=form_data.username, password=form_data.password), db)

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user
