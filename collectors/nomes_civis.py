"""Nome civil de cada vereador (por gwlegis_id).

O perfil no portal só mostra o nome parlamentar, mas os boletins do início de 2026
usam o nome civil ("Rogério A." em vez de "Rogerinho P."). Mapeamento conferido
contra o boletim de presença da sessão 1426 (partido e cargo na Mesa batem).
Vereador novo (ex.: suplente) fora daqui aparece em coleta_logs.detalhes como
"nome não reconhecido" — basta acrescentá-lo.
"""

NOMES_CIVIS: dict[int, str] = {
    7: "Edson Donizeti Ramos De Oliveira",  # Dr. Edson
    8: "Davi de Andrade Leite",  # Davi Andrade
    9: "Dionísio Ailton Pereira",  # Dionísio
    10: "Renato Gavião",  # Delegado Renato Gavião
    11: "Elizelto Guido Pereira",  # Elizelto Guido
    12: "Ely Carlos de Morais",  # Ely da Autopeças
    13: "Frederico Coutinho de Souza Dias",  # Fred Coutinho
    14: "Hélio Carlos de Oliveira",
    15: "Israel Ernani Júnior Rezende",  # Israel Russo
    16: "Leandro de Morais Pereira",  # Leandro Morais
    17: "Lívia Silva Macedo",  # Lívia Macedo
    18: "Miguel Simião Pereira Júnior",  # Miguel Tomatinho do Hospital
    19: "Odair Pereira de Souza",  # Odair Quincote
    20: "Oliveira Altair Amaral",  # Oliveira
    21: "Rogério Aparecido Narciso da Silva",  # Rogerinho da Policlínica
}
