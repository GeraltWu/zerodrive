import bcrypt
import unittest

from app.core.security import hash_password, verify_password


class PasswordHashTests(unittest.TestCase):
    def test_new_passwords_use_argon2_and_support_long_unicode(self) -> None:
        password = "网盘密码" * 30
        encoded = hash_password(password)

        self.assertTrue(encoded.startswith("$argon2"))
        self.assertTrue(verify_password(password, encoded))
        self.assertFalse(verify_password(password + "x", encoded))

    def test_existing_bcrypt_passwords_remain_valid(self) -> None:
        password = "existing-password"
        encoded = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

        self.assertTrue(verify_password(password, encoded))
        self.assertFalse(verify_password("wrong-password", encoded))


if __name__ == "__main__":
    unittest.main()
