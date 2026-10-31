# CircuitPython 9 ESP-NOW broadcasts. Two devices determine their roles by MAC.
import espnow
import wifi

radio = espnow.ESPNow()
radio.peers.append(espnow.Peer(bytes([255, 255, 255, 255, 255, 255])))
my_mac = wifi.radio.mac_address.hex()
