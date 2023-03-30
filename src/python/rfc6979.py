import hmac
import hashlib

N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141

def deterministic_k(z, secret):
    k = b'\x00' * 32
    v = b'\x01' * 32
    if z > N:
        z -= N
    z_bytes = z.to_bytes(32, 'big')
    secret_bytes = secret.to_bytes(32, 'big')
    sha256 = hashlib.sha256
    k = hmac.new(k, v + b'\x00' + secret_bytes + z_bytes, sha256).digest()
    v = hmac.new(k, v, sha256).digest()
    k = hmac.new(k, v + b'\x01' + secret_bytes + z_bytes, sha256).digest()
    v = hmac.new(k, v, sha256).digest()
    while True:
        v = hmac.new(k, v, sha256).digest()
        candidate = int.from_bytes(v, 'big')
        if candidate >= 1 and candidate < N:
            return candidate  # <2>
        k = hmac.new(k, v + b'\x00', sha256).digest()
        v = hmac.new(k, v, sha256).digest()

if __name__ == '__main__':
    z = 1
    secret = 2
    # 55011535551607205752885120107633045649828315282044383851804932465098807755297
    print(hex(deterministic_k(z, secret)))